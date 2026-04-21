import { inngest } from "@/inngest/client";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/database";
import { Message } from "@/modules/messages/models/message";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { message, roomId, projectId } = body;

        await connectToDatabase();

        await Message.create({
            content: message,
            role: "user",
            type: "TEXT",
            projectId: projectId ? new (await import("mongoose")).Types.ObjectId(projectId) : undefined,
        });

        await inngest.send({
            name: "app/room.created",
            data: {
                id: roomId || "room-" + Date.now(),
                message,
                projectId: projectId || undefined,
            },
        });

        return NextResponse.json({ 
            success: true, 
            message: "Room orchestrator triggered",
            eventId: Date.now()
        });
    } catch (error) {
        console.error("Chat API error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to process message" },
            { status: 500 }
        );
    }
}
