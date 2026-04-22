import { inngest } from "./client";
import OpenAI from "openai";
import mongoose from "mongoose";
import connectToDatabase from "@/lib/database";
import { Room } from "@/modules/room/models/room";
import { TimeSlot } from "@/modules/booking/models/timeSlot";
import { Booking } from "@/modules/booking/models/booking";
import { Message } from "@/modules/messages/models/message";
import { getFreeModels } from "@/lib/openrouter";
import { getCurrentDateString } from "@/lib/dateUtils";

const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});

const SYSTEM_PROMPT = `You are a helpful meeting room management assistant. You have access to all room and booking data. Answer questions naturally and help users with their needs.

You have access to:
- Room list with capacities
- Today's time slots (14 slots, 9 AM to 10 PM)
- Today's bookings (who booked what, when, where)

You can answer questions like:
- "How many rooms are available?" → Count rooms not booked
- "Which rooms are free at 2 PM?" → Check which room isn't booked at that slot
- "How many slots available for room 101?" → Count free slots for that room
- "Show me all bookings" → List today's bookings
- "What rooms have capacity > 10?" → Filter rooms by capacity
- Normal conversation like "Hello", "Thanks", etc.

RULES:
1. For booking requests, respond ONLY in JSON:
   {"action": "book", "roomNumber": "XXX", "slot": N, "title": "Meeting title", "bookedBy": "Name"}

2. For questions about availability, analyze the data and answer clearly

3. For past slot booking attempts, say: "❌ Cannot book a time slot in the past."

4. For room already booked, say: "❌ Room X is already booked at that time."

5. For general conversation, respond naturally without JSON

EXAMPLES:
- User: "book room 101 slot 3 for team meeting by John"
  Response: {"action": "book", "roomNumber": "101", "slot": 3, "title": "team meeting", "bookedBy": "John"}

- User: "How many rooms are free at 2 PM?"
  Response: "At 2 PM, X rooms are available. Available rooms: Room 101, Room 102..."

- User: "Hello"
  Response: "Hello! How can I help you book a room today?"

- User: "Thanks"
  Response: "You're welcome! Let me know if you need anything else."`;

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

async function callLLM(messages: any[]): Promise<string> {
    const models = await getFreeModels();

    let lastError: unknown;

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

        const rooms = await step.run("rooms", async () => {
            return await Room.find({ isActive: true }).lean();
        });

        const slots = await step.run("slots", async () => {
            return await TimeSlot.find().sort({ startTime: 1 }).lean();
        });

        const today = getCurrentDateString();
        const bookings: any[] = await step.run("bookings", async () => {
            return await Booking.find({ dateString: today, status: "CONFIRMED" })
                .populate("roomId", "roomNumber capacity")
                .populate("slotId", "label startTime endTime")
                .lean();
        });

        const roomList = rooms
            .map((r: any) => `Room ${r.roomNumber} (capacity: ${r.capacity})`)
            .join("\n");

        const slotList = slots
            .map((s: any, i: number) => `${i + 1}. ${s.label} (${s.startTime}-${s.endTime})`)
            .join("\n");

        const bookingList = bookings
            .map((b: any) => `${b.snapshot?.roomName || b.roomId?.roomNumber} - ${b.snapshot?.slotLabel || b.slotId?.label} - ${b.title} (${b.bookedBy})`)
            .join("\n") || "No bookings today";

        const messages: any[] = [
            { role: "system", content: SYSTEM_PROMPT },

            {
                role: "user",
                content: `AVAILABLE ROOMS (${rooms.length} total):
${roomList}

TIME SLOTS:
${slotList}

TODAY'S BOOKINGS (${bookings.length}):
${bookingList}

USER: ${userMessage}`,
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

        if (bookingData?.action === "book" && bookingData?.roomNumber) {
            const { roomNumber, slot, title, bookedBy } = bookingData;
            const today = getCurrentDateString();
            console.log("Booking attempt:", { roomNumber, slot, title, bookedBy, today });

            const room: any = rooms.find((r: any) => r.roomNumber === roomNumber);
            const slotIndex = slot > 0 ? slot - 1 : 0;
            const timeSlot: any = slots[slotIndex];
            console.log("Room found:", room?._id, "TimeSlot found:", timeSlot?._id);

            if (!room || !timeSlot) {
                console.log("Invalid room or slot");
                responseText = "❌ Invalid room or slot.";
            } else {
                const now = new Date();
                const bookingDate = new Date(today);
                const [hours, mins] = timeSlot.startTime.split(":").map(Number);
                bookingDate.setHours(hours, mins, 0, 0);
                console.log("Booking date:", bookingDate, "Now:", now, "Is past:", bookingDate < now);

                if (bookingDate < now) {
                    console.log("Slot is in the past");
                    responseText = "❌ Cannot book a time slot in the past.";
                } else {
                    const exists = await Booking.findOne({
                        roomId: room._id,
                        slotId: timeSlot._id,
                        dateString: today,
                        status: "CONFIRMED",
                    });

                    if (exists) {
                        console.log("Slot already booked");
                        const bookedInfo = exists.snapshot;
                        responseText = `❌ Room ${roomNumber} on ${today} (${timeSlot.label}) is already booked by ${bookedInfo?.roomName || "someone else"}.`;
                    } else {
                        console.log("Creating booking for:", { roomNumber, date: today, slot: timeSlot.label });
                        await Booking.create({
                            bookedBy: bookedBy || "Guest",
                            roomId: room._id,
                            slotId: timeSlot._id,
                            date: new Date(today),
                            dateString: today,
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
                        console.log("Booking created successfully");

                        responseText = `✅ Booked Room ${roomNumber} on ${today} for ${bookedBy || "Guest"}\n📅 ${timeSlot.label}\n👥 Capacity: ${room.capacity}\n📋 Title: ${title}`;
                    }
                }
            }
        }

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