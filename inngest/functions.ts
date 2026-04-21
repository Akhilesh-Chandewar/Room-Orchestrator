import { inngest } from "./client";
import { gemini, createAgent, createTool, createNetwork } from "@inngest/agent-kit";
import mongoose from "mongoose";
import { z } from "zod";
import connectToDatabase from "@/lib/database";
import { Room } from "@/modules/room/models/room";
import { TimeSlot } from "@/modules/booking/models/timeSlot";
import { Booking } from "@/modules/booking/models/booking";

const ROOM_BOOKING_PROMPT = `You are a room booking assistant. Your job is to help users book meeting rooms through natural conversation.

Available information:
- You have access to room data including room numbers, capacities, and availability
- Users can book rooms for specific dates and time slots
- Time slots are: 9:00 AM – 10:00 AM, 10:00 AM – 11:00 AM, 11:00 AM – 12:00 PM, 12:00 PM – 1:00 PM, 1:00 PM – 2:00 PM, 2:00 PM – 3:00 PM, 3:00 PM – 4:00 PM, 4:00 PM – 5:00 PM

When handling booking requests:
1. Extract the room number, date, time slot, and meeting title from the user's message
2. Use the available tools to check room availability and create bookings
3. Confirm the booking with the user, including all details

If the user provides incomplete information:
- Ask for the missing details (room number, date, time slot, or meeting title)

Always respond in a friendly, helpful manner. Format your response clearly with booking confirmation details.`;

export const roomOrchestrator = inngest.createFunction(
    { id: "room-orchestrator", triggers: { event: "app/room.created" } },
    async ({ event, step }) => {
        await connectToDatabase();

        const { message, projectId } = event.data;

        const getRooms = createTool({
            name: "getRooms",
            description: "Get all available rooms with their details",
            parameters: z.object({}),
            handler: async () => {
                const rooms = await Room.find({ isActive: true }).sort({ roomNumber: 1 });
                return rooms.map(r => ({
                    id: r._id.toString(),
                    roomNumber: r.roomNumber,
                    capacity: r.capacity
                }));
            }
        });

        const getTimeSlots = createTool({
            name: "getTimeSlots",
            description: "Get all available time slots",
            parameters: z.object({}),
            handler: async () => {
                const slots = await TimeSlot.find({ isActive: true }).sort({ startMinutes: 1 });
                return slots.map(s => ({
                    id: s._id.toString(),
                    label: s.label,
                    startTime: s.startTime,
                    endTime: s.endTime
                }));
            }
        });

        const checkAvailability = createTool({
            name: "checkAvailability",
            description: "Check if a room is available for a specific date and time slot",
            parameters: z.object({
                roomId: z.string(),
                dateString: z.string(),
                slotId: z.string().optional()
            }),
            handler: async ({ roomId, dateString, slotId }) => {
                const query: any = {
                    roomId: new mongoose.Types.ObjectId(roomId),
                    dateString,
                    status: "CONFIRMED"
                };
                
                if (slotId) {
                    query.slotId = new mongoose.Types.ObjectId(slotId);
                }
                
                const bookings = await Booking.find(query);
                return { available: bookings.length === 0, bookingsCount: bookings.length };
            }
        });

        const createBookingTool = createTool({
            name: "createBooking",
            description: "Create a room booking",
            parameters: z.object({
                roomId: z.string(),
                slotId: z.string(),
                date: z.string(),
                title: z.string(),
                notes: z.string().optional()
            }),
            handler: async ({ roomId, slotId, date, title, notes }) => {
                const room = await Room.findById(roomId);
                const slot = await TimeSlot.findById(slotId);
                
                if (!room || !slot) {
                    throw new Error("Room or time slot not found");
                }

                const existingBooking = await Booking.findOne({
                    roomId: new mongoose.Types.ObjectId(roomId),
                    slotId: new mongoose.Types.ObjectId(slotId),
                    dateString: date,
                    status: "CONFIRMED"
                });

                if (existingBooking) {
                    throw new Error("This slot is already booked");
                }

                const booking = await Booking.create({
                    userId: new mongoose.Types.ObjectId(),
                    roomId: new mongoose.Types.ObjectId(roomId),
                    slotId: new mongoose.Types.ObjectId(slotId),
                    date: new Date(date),
                    dateString: date,
                    title,
                    notes,
                    status: "CONFIRMED",
                    snapshot: {
                        roomName: `Room ${room.roomNumber}`,
                        roomNumber: room.roomNumber,
                        floor: parseInt(room.roomNumber.charAt(0)) || 1,
                        capacity: room.capacity,
                        slotLabel: slot.label,
                        slotStart: slot.startTime,
                        slotEnd: slot.endTime
                    }
                });

                return {
                    success: true,
                    bookingId: booking._id.toString(),
                    roomNumber: room.roomNumber,
                    date,
                    timeSlot: slot.label,
                    title
                };
            }
        });

        const bookingAgent = createAgent({
            name: "room-booking-assistant",
            description: "Helps users book meeting rooms",
            system: ROOM_BOOKING_PROMPT,
            model: gemini({ model: "gemini-2.0-flash" }),
            tools: [getRooms, getTimeSlots, checkAvailability, createBookingTool]
        });

        const network = createNetwork({
            name: "room-booking-network",
            agents: [bookingAgent],
            maxIter: 5,
            router: async ({ network }) => {
                return bookingAgent;
            }
        });

        const result = await network.run(message);

        const responseText = typeof result === 'string' 
            ? result 
            : JSON.stringify(result);

        return {
            success: true,
            message: responseText,
            projectId
        };
    }
);