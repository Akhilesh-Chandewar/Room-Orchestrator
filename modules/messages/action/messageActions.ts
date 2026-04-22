"use server";

import connectToDatabase from "@/lib/database";
import { Message } from "../models/message";

export async function saveMessage({
    content,
    role,
    type = "TEXT",
}: {
    content: string;
    role: "user" | "assistant" | "system";
    type?: "TEXT" | "RESULT" | "ERROR";
}) {
    await connectToDatabase();

    const message = await Message.create({
        content,
        role,
        type,
    });

    return message;
}

export async function getMessages() {
    await connectToDatabase();

    const messages = await Message.find({}).sort({ createdAt: 1 });
    return messages;
}