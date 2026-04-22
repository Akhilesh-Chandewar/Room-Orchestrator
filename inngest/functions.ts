import { inngest } from "./client";
import OpenAI from "openai";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/database";
import { Room } from "@/modules/room/models/room";
import { TimeSlot } from "@/modules/booking/models/timeSlot";
import { Booking } from "@/modules/booking/models/booking";
import { Message } from "@/modules/messages/models/message";
import { getFreeModels } from "@/lib/openrouter";

const responseCache = new Map<string, { data: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCurrentDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "",
});

const SYSTEM_PROMPT = `You are a friendly room booking assistant.

RULES:
1. Extract: room number, date (MUST BE TODAY = ${getCurrentDateString()}), slot (1-14), title
2. Ask ONE question if missing info
3. ONLY allow bookings for TODAY (${getCurrentDateString()}) - reject any other date
4. Cannot book slots in the past - reject them
5. Check if room/slot is already booked before confirming
6. When ready respond ONLY in JSON:

{
  "roomNumber": "XXX",
  "date": "YYYY-MM-DD",
  "slot": N,
  "title": "Meeting title",
  "bookedBy": "Name"
}

Otherwise respond normally.`;

function isQuotaError(error: unknown): boolean {
    return JSON.stringify(error).includes("429");
}

async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3
): Promise<T> {
    let err;

    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            err = e;
            if (!isQuotaError(e)) throw e;
            await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        }
    }

    throw err;
}

async function callLLM(messages: any[]) {
    const models = await getFreeModels();

    let lastError;

    for (const model of models) {
        try {
            console.log("Trying model:", model);

            const res = await openrouter.chat.completions.create({
                model,
                messages,
                temperature: 0.7,
            });

            const content = res.choices[0]?.message?.content;
            if (content) return content;
        } catch (err) {
            lastError = err;
            console.log("Model failed:", model);
        }
    }

    throw lastError;
}

async function callWithTimeout(messages: any[]) {
    return Promise.race([
        callLLM(messages),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 15000)
        ),
    ]);
}

export const roomOrchestrator = inngest.createFunction(
    { id: "room-orchestrator", triggers: { event: "app/room.created" } },
    async ({ event, step }) => {
        await connectToDatabase();

        const { message: userMessage } = event.data;

        const cacheKey = JSON.stringify({ userMessage });
        const cached = responseCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return { success: true, message: cached.data };
        }

        const history = await step.run("history", async () => {
            const msgs = await Message.find()
                .sort({ createdAt: -1 })
                .limit(6)
                .lean();

            return msgs.reverse();
        });

        const rooms = await Room.find({ isActive: true });
        const slots = await TimeSlot.find({ isActive: true });

        const roomList = rooms.map((r: any) => r.roomNumber).join(", ");
        const slotList = slots.map((s: any, i: number) => `${i + 1}:${s.label}`).join(", ");

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },

            ...history.map((m: any) => ({
                role: m.role,
                content: m.content,
            })),

            {
                role: "user",
                content: `Rooms: ${roomList}
Slots: ${slotList}
User: ${userMessage}`,
            },
        ];

        let responseText = "";

        try {
            responseText = (await retryWithBackoff(() =>
                callWithTimeout(messages)
            )) as string;
        } catch (e: any) {
            responseText = "❌ AI error. Try again.";
        }

        // 🔥 JSON parsing
        let bookingData = null;

        try {
            bookingData = JSON.parse(responseText);
        } catch { }

        if (bookingData?.roomNumber) {
            const { roomNumber, date, slot, title, bookedBy } = bookingData;

            const today = getCurrentDateString();
            if (date !== today) {
                responseText = `❌ Bookings are only allowed for today (${today}). Please try again with today's date.`;
            } else {
                const room = rooms.find((r: any) => r.roomNumber === roomNumber);
                const slotIndex = slot > 0 ? slot - 1 : 0;
                const timeSlot = slots[slotIndex];

if (!room || !timeSlot) {
                responseText = "❌ Invalid room or slot.";
            } else {
                const now = new Date();
                const bookingDate = new Date(today);
                const [hours, mins] = timeSlot.startTime.split(":").map(Number);
                bookingDate.setHours(hours, mins, 0, 0);

                if (bookingDate < now) {
                        responseText = "❌ Cannot book a time slot in the past.";
                    } else {
                        const exists = await Booking.findOne({
                            roomId: room._id,
                            slotId: timeSlot._id,
                            dateString: date,
                            status: "CONFIRMED",
                        });

                        if (exists) {
                            const bookedInfo = exists.snapshot;
                            responseText = `❌ Room ${roomNumber} on ${date} (${timeSlot.label}) is already booked by ${bookedInfo?.roomName || "someone else"}.`;
                        } else {
                            await Booking.create({
                                bookedBy: bookedBy || "Guest",
                                roomId: room._id,
                                slotId: timeSlot._id,
                                date: new Date(date),
                                dateString: date,
                                title,
                                status: "CONFIRMED",
                                snapshot: {
                                    roomName: `Room ${roomNumber}`,
                                    roomNumber: roomNumber,
                                    floor: parseInt(roomNumber.charAt(0)) || 1,
                                    capacity: room.capacity,
                                    slotLabel: timeSlot.label,
                                    slotStart: timeSlot.startTime,
                                    slotEnd: timeSlot.endTime,
                                },
                            });

                            responseText = `✅ Booked Room ${roomNumber} on ${date} for ${bookedBy || "Guest"}\n📅 ${timeSlot.label}\n👥 Capacity: ${room.capacity}\n📋 Title: ${title}`;
                        }
                    }
                }
            }
        }

        responseCache.set(cacheKey, {
            data: responseText,
            timestamp: Date.now(),
        });

        await step.run("save-ai", async () => {
            try {
                await Message.create({
                    content: responseText,
                    role: "assistant",
                });
                console.log("Assistant message saved:", responseText);
            } catch (err) {
                console.error("Failed to save assistant message:", err);
            }
        });

        return {
            success: !responseText.startsWith("❌"),
            message: responseText,
        };
    }
);