"use client";

import { useEffect, useState, useCallback } from "react";
import { getAllRooms } from "@/modules/room/action";
import { getBookings } from "@/modules/booking/action/getBookings";
import { getTimeSlots } from "@/modules/booking/action/getTimeSlots";
import { useRefresh } from "@/modules/home/context/RefreshContext";
import { getCurrentDateString } from "@/lib/dateUtils";

export const RoomView = () => {
    const [rooms, setRooms] = useState<any[]>([]);
    const [bookings, setBookings] = useState<any[]>([]);
    const [timeSlots, setTimeSlots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(getCurrentDateString);
    
    const { registerRefresh } = useRefresh();

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [roomsData, bookingsData, slotsData] = await Promise.all([
                getAllRooms(),
                getBookings(selectedDate),
                getTimeSlots(),
            ]);
            setRooms(roomsData || []);
            setBookings(bookingsData || []);
            setTimeSlots(slotsData || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        registerRefresh(loadData);
    }, [registerRefresh, loadData]);

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    if (loading) {
        return <div className="p-4">Loading...</div>;
    }

    console.log("RoomView debug:", { rooms: rooms.length, bookings: bookings.length, timeSlots: timeSlots.length, selectedDate });

    if (rooms.length === 0) {
        return <div className="p-4">No rooms found. Run npm run seed</div>;
    }

    if (timeSlots.length === 0) {
        return <div className="p-4">No timeslots found. Run npm run seed</div>;
    }

    const isBooked = (roomId: string, slotId: string) => {
        return bookings.find(
            (b) => b.roomId === roomId && b.slotId === slotId
        );
    };

    const displayRooms = rooms.slice(0, 15);
    const displaySlots = timeSlots;

    const getSlotStatus = (roomId: string, slotId: string) => {
        const booking = isBooked(roomId, slotId);
        if (!booking) return null;
        
        const now = new Date();
        const bookingDate = new Date(booking.date);
        const [hours, mins] = (booking.snapshot?.slotStart || "12:00").split(":").map(Number);
        bookingDate.setHours(hours, mins, 0, 0);
        
        const isPast = bookingDate < now;
        const bookedBy = booking.bookedBy || booking.snapshot?.roomName || "Someone";
        
        return {
            booked: true,
            title: booking.title,
            bookedBy,
            status: booking.status,
            isPast,
        };
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Date:</label>
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                />
            </div>
            
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-background border p-2 z-10 font-bold min-w-[80px]">
                                Room
                            </th>
                            {displaySlots.map((slot) => (
                                <th
                                    key={slot._id}
                                    className="border p-2 text-xs font-medium min-w-[80px] whitespace-nowrap"
                                >
                                    {slot.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayRooms.map((room) => (
                            <tr key={room._id}>
                                <td className="sticky left-0 bg-background border p-2 font-bold text-center z-10">
                                    {room.roomNumber}
                                </td>
                                {displaySlots.map((slot) => {
                                    const slotInfo = getSlotStatus(room._id, slot._id);
                                    return (
                                        <td
                                            key={slot._id}
                                            className={`border p-1 text-center cursor-pointer group relative ${
                                                slotInfo?.booked
                                                    ? slotInfo.isPast
                                                        ? "bg-gray-400 text-white"
                                                        : "bg-red-500 text-white"
                                                    : "bg-green-500 text-white"
                                            }`}
                                        >
                                            <span className="text-xs">
                                                {slotInfo?.booked 
                                                    ? slotInfo.isPast 
                                                        ? "Past" 
                                                        : "Booked" 
                                                    : "Free"}
                                            </span>
                                            {slotInfo?.booked && (
                                                <div className="absolute hidden group-hover:block z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 w-40 bg-gray-900 text-white text-xs p-2 rounded">
                                                    <div><strong>Title:</strong> {slotInfo.title}</div>
                                                    <div><strong>By:</strong> {slotInfo.bookedBy}</div>
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};