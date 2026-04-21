import { inngest } from "./client";
import OpenAI from "openai";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/database";
import { Room } from "@/modules/room/models/room";
import { TimeSlot } from "@/modules/booking/models/timeSlot";
import { Booking } from "@/modules/booking/models/booking";
import { Message } from "@/modules/messages/models/message";

const responseCache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function isQuotaError(error: unknown): boolean {
    if (!error) return false;
    const errorStr = JSON.stringify(error);
    return (
        errorStr.includes("429") ||
        errorStr.includes("rate_limit") ||
        errorStr.includes("Rate limit") ||
        errorStr.includes("quota") ||
        errorStr.includes("insufficient_quota")
    );
}

async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 5000
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            lastError = error;

            if (isQuotaError(error)) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.log(`Rate limit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }

    throw lastError;
}

const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "",
    defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Room Orchestrator",
    },
});

const SYSTEM_PROMPT = `You are a friendly room booking assistant. Help users book meeting rooms.

AVAILABLE ROOMS (use these exact room numbers): 101, 102, 103, 104, 105, 201, 202, 203, 301, 302
Each room has capacity of 8-20 people.

TIME SLOTS:
- 9:00 AM – 10:00 AM (slot 1)
- 10:00 AM – 11:00 AM (slot 2)
- 11:00 AM – 12:00 PM (slot 3)
- 12:00 PM – 1:00 PM (slot 4)
- 1:00 PM – 2:00 PM (slot 5)
- 2:00 PM – 3:00 PM (slot 6)
- 3:00 PM – 4:00 PM (slot 7)
- 4:00 PM – 5:00 PM (slot 8)

RULES:
1. Extract: room number, date, time slot number (1-8), meeting title
2. If missing info, ask ONE question at a time
3. When you have all info, respond with EXACTLY this format:

BOOKING_REQUEST:
{
  "roomNumber": "XXX",
  "date": "YYYY-MM-DD",
  "slot": N,
  "title": "Meeting title"
}

Example: "Book room 101 tomorrow at 2pm for team standup"
→ Room: 101, Date: tomorrow's date, Slot: 6 (2pm is slot 6), Title: team standup

If there's an error or user wants to cancel, respond with regular text (no BOOKING_REQUEST).`;

export const roomOrchestrator = inngest.createFunction(
    { id: "room-orchestrator", triggers: { event: "app/room.created" } },
    async ({ event, step }) => {
        await connectToDatabase();

        const { message: userMessage, projectId } = event.data;

        const cacheKey = JSON.stringify({ message: userMessage, projectId });
        const cached = responseCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log("Returning cached response");
            return { success: true, message: cached.data, projectId, cached: true };
        }

        await step.run("save-user-message", async () => {
            await Message.create({
                content: userMessage,
                role: "user",
                type: "TEXT",
                projectId: projectId ? new mongoose.Types.ObjectId(projectId) : undefined,
            });
        });

        const previousMessages = await step.run("get-previous-messages", async () => {
            const query: any = {};
            if (projectId) {
                query.projectId = new mongoose.Types.ObjectId(projectId);
            }
            
            const messages = await Message.find(query)
                .sort({ createdAt: -1 })
                .limit(4)
                .lean();
            
            return messages.reverse().map(m => `${m.role}: ${m.content}`).join("\n");
        });

        const rooms = await step.run("get-rooms", async () => {
            return await Room.find({ isActive: true }).sort({ roomNumber: 1 });
        });

        const timeSlots = await step.run("get-timeslots", async () => {
            return await TimeSlot.find({ isActive: true }).sort({ startMinutes: 1 });
        });

        const roomList = rooms.map((r: any) => `${r.roomNumber} (capacity: ${r.capacity})`).join(", ");
        const slotList = timeSlots.map((s: any, i: number) => `${i + 1}: ${s.label}`).join(", ");

        const prompt = `Available rooms: ${roomList}
Available time slots: ${slotList}

Conversation so far:
${previousMessages}

User: ${userMessage}

${SYSTEM_PROMPT}`;

        let responseText = "";

        try {
            responseText = await retryWithBackoff(async () => {
                const completion = await openrouter.chat.completions.create({
                    model: "mistralai/mistral-7b-instruct",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                });
                return completion.choices[0]?.message?.content || "No response";
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "API error";
            console.error("OpenRouter API error:", errorMessage);
            
            if (isQuotaError(error)) {
                responseText = "⏳ I'm experiencing high demand right now. Please wait a moment and try again.";
            } else {
                responseText = `❌ Error: ${errorMessage}. Please try again.`;
            }
        }

        const bookingMatch = responseText.match(/BOOKING_REQUEST:\s*({[\s\S]*?})/);
        
        if (bookingMatch) {
            try {
                const bookingData = JSON.parse(bookingMatch[1]);
                const { roomNumber, date, slot, title } = bookingData;

                const room = rooms.find((r: any) => r.roomNumber === roomNumber);
                const timeSlot = timeSlots[slot - 1];

                if (!room) {
                    responseText = `❌ Room ${roomNumber} not found. Please choose from: ${roomList}`;
                } else if (!timeSlot) {
                    responseText = `❌ Invalid time slot. Please choose from 1-8.`;
                } else {
                    const existingBooking = await Booking.findOne({
                        roomId: room._id,
                        slotId: timeSlot._id,
                        dateString: date,
                        status: "CONFIRMED"
                    });

                    if (existingBooking) {
                        responseText = `❌ Room ${roomNumber} is already booked for ${timeSlot.label} on ${date}. Would you like to try a different time?`;
                    } else {
                        await Booking.create({
                            userId: new mongoose.Types.ObjectId(),
                            roomId: room._id,
                            slotId: timeSlot._id,
                            date: new Date(date),
                            dateString: date,
                            title,
                            status: "CONFIRMED",
                            snapshot: {
                                roomName: `Room ${room.roomNumber}`,
                                roomNumber: room.roomNumber,
                                floor: parseInt(room.roomNumber.charAt(0)) || 1,
                                capacity: room.capacity,
                                slotLabel: timeSlot.label,
                                slotStart: timeSlot.startTime,
                                slotEnd: timeSlot.endTime
                            }
                        });

                        responseText = `🎉 **Booking Confirmed!**

| Detail | Info |
|--------|------|
| Room | ${roomNumber} |
| Date | ${date} |
| Time | ${timeSlot.label} |
| Title | ${title} |`;
                    }
                }
            } catch (parseError) {
                console.error("Parse error:", parseError);
                responseText = "I couldn't process that booking. Could you please provide the details again?";
            }
        }

        responseCache.set(cacheKey, { data: responseText, timestamp: Date.now() });
        if (responseCache.size > 50) {
            const firstKey = responseCache.keys().next().value;
            if (firstKey) responseCache.delete(firstKey);
        }

        await step.run("save-assistant-message", async () => {
            await Message.create({
                content: responseText,
                role: "assistant",
                type: responseText.startsWith("❌") || responseText.startsWith("⏳") ? "ERROR" : "TEXT",
                projectId: projectId ? new mongoose.Types.ObjectId(projectId) : undefined,
            });
        });

        return {
            success: !responseText.startsWith("❌"),
            message: responseText,
            projectId
        };
    }
);