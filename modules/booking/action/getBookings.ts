"use server";

import connectToDatabase from "@/lib/database";
import { Booking } from "../models/booking";

function getCurrentDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export async function getBookings(dateString?: string) {
    await connectToDatabase();
    const targetDate = dateString || getCurrentDateString();
    console.log("Fetching bookings for:", targetDate);
    
    const query: any = { status: "CONFIRMED", dateString: targetDate };
    
    const bookings = await Booking.find(query).sort({ date: 1, slotId: 1 });
    console.log("Found bookings:", bookings.length);
    return JSON.parse(JSON.stringify(bookings));
}

export async function getTodayBookings() {
    return getBookings();
}