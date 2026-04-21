"use server";

import connectToDatabase from "@/lib/database";
import { Booking } from "../models/booking";

export async function getTodayBookings() {
    await connectToDatabase();
    const today = new Date();
    const dateString = today.toISOString().split("T")[0];
    const bookings = await Booking.find({
        dateString,
        status: "CONFIRMED",
    });
    return JSON.parse(JSON.stringify(bookings));
}