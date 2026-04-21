"use client";

import { getAllRooms } from "@/modules/room/action";
import { getTodayBookings } from "@/modules/booking/action/getBookings";
import { useEffect, useState } from "react";
import { getTimeSlots } from "@/modules/booking/action/getTimeSlots";

export const RoomView = () => {
    const [rooms, setRooms] = useState<any[]>([]);
    const [bookings, setBookings] = useState<any[]>([]);
    const [timeSlots, setTimeSlots] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([getAllRooms(), getTodayBookings(), getTimeSlots()]).then(
            ([roomsData, bookingsData, slotsData]: any) => {
                setRooms(roomsData || []);
                setBookings(bookingsData || []);
                setTimeSlots(slotsData || []);
                setLoading(false);
            }
        ).catch((err) => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return <div className="p-4">Loading...</div>;
    }

    if (rooms.length === 0) {
        return <div className="p-4">No rooms found. Run npm run seed</div>;
    }

    if (timeSlots.length === 0) {
        return <div className="p-4">No timeslots found.</div>;
    }

    const isBooked = (roomId: string, slotId: string) => {
        return bookings.some(
            (b) => b.roomId === roomId && b.slotId === slotId
        );
    };

    const displayRooms = rooms.slice(0, 15);
    const displaySlots = timeSlots.slice(0, 5);

    return (
        <div className="grid grid-cols-3 gap-2 h-full content-center">
            {displayRooms.map((room) => {
                const bookedAny = displaySlots.some((slot) => isBooked(room._id, slot._id));
                return (
                    <div
                        key={room._id}
                        className={`group min-h-[80px] relative flex flex-col items-center justify-center rounded-lg font-medium text-white ${
                            bookedAny
                                ? "bg-red-500"
                                : "bg-green-500"
                        }`}
                    >
                        <span className="text-lg font-bold group-hover:opacity-0 transition-opacity">{room.roomNumber}</span>
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center opacity-0 group-hover:opacity-100 transition-opacity bg-inherit">
                            <span className="text-sm font-bold">{room.roomNumber}</span>
                            <span className="text-xs">Cap: {room.capacity}</span>
                            <span className="text-xs">
                                {displaySlots.map((slot) => 
                                    isBooked(room._id, slot._id) ? slot.label : null
                                ).filter(Boolean).join(", ") || "All slots free"}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};