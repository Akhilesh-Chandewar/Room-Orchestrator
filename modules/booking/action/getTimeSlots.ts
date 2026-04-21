"use server";

import connectToDatabase from "@/lib/database";
import { TimeSlot } from "../models/timeSlot";

export async function getTimeSlots() {
    await connectToDatabase();
    const slots = await TimeSlot.find({ isActive: true }).sort({ startMinutes: 1 });
    return JSON.parse(JSON.stringify(slots));
}