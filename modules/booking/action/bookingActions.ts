"use server";

import mongoose from "mongoose";
import connectToDatabase from "@/lib/database";
import { Booking, IBookingSnapshot } from "../models/booking";
import { Room } from "@/modules/room/models/room";
import { TimeSlot } from "../models/timeSlot";

export async function getAvailableRooms() {
    await connectToDatabase();
    const rooms = await Room.find({ isActive: true }).sort({ roomNumber: 1 });
    return rooms;
}

export async function getTimeSlots() {
    await connectToDatabase();
    const slots = await TimeSlot.find({ isActive: true }).sort({ startMinutes: 1 });
    return slots;
}

export async function getBookingsForDate(dateString: string) {
    await connectToDatabase();
    const bookings = await Booking.find({
        dateString,
        status: "CONFIRMED",
    }).populate("roomId").populate("slotId");
    return bookings;
}

export async function checkAvailability(roomId: string, dateString: string, slotId?: string) {
    await connectToDatabase();
    const query: any = {
        roomId: new mongoose.Types.ObjectId(roomId),
        dateString,
        status: "CONFIRMED",
    };
    
    if (slotId) {
        query.slotId = new mongoose.Types.ObjectId(slotId);
    }
    
    const bookings = await Booking.find(query);
    return bookings.length === 0;
}

export async function createBooking({
    roomId,
    slotId,
    date,
    title,
    bookedBy = "Guest",
}: {
    roomId: string;
    slotId: string;
    date: string;
    title: string;
    bookedBy?: string;
}) {
    await connectToDatabase();

    const room = await Room.findById(roomId);
    if (!room) {
        throw new Error("Room not found");
    }

    const slot = await TimeSlot.findById(slotId);
    if (!slot) {
        throw new Error("Time slot not found");
    }

    const dateString = date.split("T")[0];

    const existingBooking = await Booking.findOne({
        roomId: new mongoose.Types.ObjectId(roomId),
        slotId: new mongoose.Types.ObjectId(slotId),
        dateString,
        status: "CONFIRMED",
    });

    if (existingBooking) {
        throw new Error("This slot is already booked");
    }

    const dateObj = new Date(date);

    const snapshot: IBookingSnapshot = {
        roomName: `Room ${room.roomNumber}`,
        roomNumber: room.roomNumber,
        floor: parseInt(room.roomNumber.charAt(0)) || 1,
        capacity: room.capacity,
        slotLabel: slot.label,
        slotStart: slot.startTime,
        slotEnd: slot.endTime,
    };

    const booking = await Booking.create({
        bookedBy,
        roomId: new mongoose.Types.ObjectId(roomId),
        slotId: new mongoose.Types.ObjectId(slotId),
        date: dateObj,
        dateString,
        title,
        status: "CONFIRMED",
        snapshot,
    });

    return booking;
}