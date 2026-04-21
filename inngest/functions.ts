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

const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "",
});

const SYSTEM_PROMPT = `You are a friendly room booking assistant.

RULES:
1. Extract: room number, date, slot (1-8), title
2. Ask ONE question if missing info
3. When ready respond ONLY in JSON:

{
  "roomNumber": "XXX",
  "date": "YYYY-MM-DD",
  "slot": N,
  "title": "Meeting title"
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

        const { message: userMessage, projectId } = event.data;

        const cacheKey = JSON.stringify({ userMessage });
        const cached = responseCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return { success: true, message: cached.data };
        }

        await step.run("save-user", async () => {
            await Message.create({
                content: userMessage,
                role: "user",
            });
        });

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
            const { roomNumber, date, slot, title } = bookingData;

            const room = rooms.find((r: any) => r.roomNumber === roomNumber);
            const timeSlot = slots[slot - 1];

            if (!room || !timeSlot) {
                responseText = "❌ Invalid room or slot.";
            } else {
                const exists = await Booking.findOne({
                    roomId: room._id,
                    slotId: timeSlot._id,
                    dateString: date,
                });

                if (exists) {
                    responseText = `❌ Room ${roomNumber} already booked.`;
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
                            roomName: `Room ${roomNumber}`,
                            roomNumber: roomNumber,
                            floor: parseInt(roomNumber.charAt(0)) || 1,
                            capacity: room.capacity,
                            slotLabel: timeSlot.label,
                            slotStart: timeSlot.startTime,
                            slotEnd: timeSlot.endTime,
                        },
                    });

                    responseText = `✅ Booked Room ${roomNumber} on ${date} (${timeSlot.label})`;
                }
            }
        }

        responseCache.set(cacheKey, {
            data: responseText,
            timestamp: Date.now(),
        });

        await step.run("save-ai", async () => {
            await Message.create({
                content: responseText,
                role: "assistant",
            });
        });

        return {
            success: !responseText.startsWith("❌"),
            message: responseText,
        };
    }
);