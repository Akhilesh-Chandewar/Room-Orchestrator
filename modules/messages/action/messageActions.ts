"use server";

import connectToDatabase from "@/lib/database";
import { Message } from "../models/message";

export async function saveMessage({
    content,
    role,
    type = "TEXT",
    projectId,
}: {
    content: string;
    role: "user" | "assistant" | "system";
    type?: "TEXT" | "RESULT" | "ERROR";
    projectId?: string;
}) {
    await connectToDatabase();

    const message = await Message.create({
        content,
        role,
        type,
        projectId: projectId ? new (await import("mongoose")).Types.ObjectId(projectId) : undefined,
    });

    return message;
}

export async function getMessages(projectId?: string) {
    await connectToDatabase();

    const query: any = {};
    if (projectId) {
        query.projectId = new (await import("mongoose")).Types.ObjectId(projectId);
    }

    const messages = await Message.find(query).sort({ createdAt: 1 });
    return messages;
}