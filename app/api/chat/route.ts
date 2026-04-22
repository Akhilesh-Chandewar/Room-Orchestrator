import { inngest } from "@/inngest/client";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/database";
import { Message } from "@/modules/messages/models/message";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { message } = body;

        await connectToDatabase();

        try {
        await Message.create({
            content: message,
            role: "user",
            type: "TEXT",
        });
    } catch (err) {
        console.log("Failed to save user message:", err);
    }

        const eventResult = await inngest.send({
            name: "app/room.created",
            data: {
                id: "room-" + Date.now(),
                message,
            },
        });

        console.log("Inngest event sent:", eventResult);

        return NextResponse.json({ 
            success: true, 
            message: "Room orchestrator triggered",
            eventId: Date.now(),
        });
    } catch (error) {
        console.error("Chat API error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to process message" },
            { status: 500 }
        );
    }
}