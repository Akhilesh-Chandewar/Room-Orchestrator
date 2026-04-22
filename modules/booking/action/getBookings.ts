"use server";

import connectToDatabase from "@/lib/database";
import { Booking } from "../models/booking";
import { getCurrentDateString } from "@/lib/dateUtils";

export async function getBookings(dateString?: string) {
    await connectToDatabase();
    const targetDate = dateString || getCurrentDateString();
    
    const query: any = { status: "CONFIRMED" };
    
    const allBookings = await Booking.find(query).lean();
    const filtered = allBookings.filter((b: any) => b.dateString === targetDate);
    
    console.log("getBookings:", { targetDate, total: allBookings.length, filtered: filtered.length });
    
    return JSON.parse(JSON.stringify(filtered));
}

export async function getTodayBookings() {
    return getBookings();
}