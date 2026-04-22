import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/database";
import { Booking } from "@/modules/booking/models/booking";
import { Room } from "@/modules/room/models/room";
import { TimeSlot } from "@/modules/booking/models/timeSlot";
import { Message } from "@/modules/messages/models/message";
import { getCurrentDateString } from "@/lib/dateUtils";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { roomNumber, slot, title, bookedBy } = body;
        
        await connectToDatabase();
        
        const today = getCurrentDateString();
        const room = await Room.findOne({ roomNumber, isActive: true });
        
        if (!room) {
            return NextResponse.json({ error: "Room not found" }, { status: 400 });
        }
        
        const slotIndex = slot > 0 ? slot - 1 : 0;
        const timeSlot = await TimeSlot.findOne({ isActive: true }).skip(slotIndex);
        
        if (!timeSlot) {
            return NextResponse.json({ error: "Slot not found" }, { status: 400 });
        }
        
        const exists = await Booking.findOne({
            roomId: room._id,
            slotId: timeSlot._id,
            dateString: today,
            status: "CONFIRMED",
        });
        
        if (exists) {
            return NextResponse.json({ error: "Already booked" }, { status: 400 });
        }
        
        const booking = await Booking.create({
            bookedBy: bookedBy || "Guest",
            roomId: room._id,
            slotId: timeSlot._id,
            date: new Date(today),
            dateString: today,
            title,
            status: "CONFIRMED",
            snapshot: {
                roomName: `Room ${roomNumber}`,
                roomNumber: roomNumber,
                floor: parseInt(roomNumber.charAt(0)) || 1,
                capacity: room.capacity,
                slotLabel: timeSlot.label,
                slotStart: timeSlot.startTime,
                slotEnd: timeSlot.endTime,
            },
        });
        
        await Message.create({
            content: `✅ Booked Room ${roomNumber} on ${today} for ${bookedBy || "Guest"}\n📅 ${timeSlot.label}\n👥 Capacity: ${room.capacity}\n📋 Title: ${title}`,
            role: "assistant",
        });
        
        return NextResponse.json({ success: true, booking });
    } catch (error) {
        console.error("Book API error:", error);
        return NextResponse.json({ error: "Failed to book" }, { status: 500 });
    }
}