import { inngest } from "@/inngest/client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { message, roomId } = body;

        await inngest.send({
            name: "app/room.created",
            data: {
                id: roomId || "room-" + Date.now(),
                message,
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
