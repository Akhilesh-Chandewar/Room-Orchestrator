import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/database";
import { Message } from "@/modules/messages/models/message";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const projectId = searchParams.get("projectId");

        await connectToDatabase();

        const query: any = {};
        if (projectId) {
            query.projectId = projectId;
        }

        const messages = await Message.find(query)
            .sort({ createdAt: 1 })
            .limit(50)
            .lean();

        return NextResponse.json({
            messages: messages.map(m => ({
                _id: m._id.toString(),
                role: m.role,
                content: m.content,
                type: m.type,
                createdAt: m.createdAt.toISOString(),
            })),
        });
    } catch (error) {
        console.error("Error fetching messages:", error);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 }
        );
    }
}