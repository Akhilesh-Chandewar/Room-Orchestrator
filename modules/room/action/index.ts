"use server";

import connectToDatabase from "@/lib/database";
import { Room } from "../models/room";

export async function getAllRooms() {
    await connectToDatabase();
    const rooms = await Room.find({ isActive: true }).sort({ createdAt: -1 });
    return JSON.parse(JSON.stringify(rooms));
}