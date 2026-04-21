import mongoose, { Document, Model, Schema } from "mongoose";

export interface IBookingSnapshot {
    roomName: string;
    roomNumber: string;
    floor: number;
    capacity: number;
    slotLabel: string;
    slotStart: string;
    slotEnd: string;
}

export interface IBooking extends Document {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    roomId: mongoose.Types.ObjectId;
    slotId: mongoose.Types.ObjectId;
    date: Date;                         // stored as midnight UTC
    dateString: string;                 // "2024-12-20" — for fast indexed queries
    title: string;
    notes?: string;
    status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
    snapshot: IBookingSnapshot;         // denormalized at booking time
    cancelledAt?: Date;
    cancelledBy?: mongoose.Types.ObjectId;
    cancellationReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BookingSnapshotSchema = new Schema<IBookingSnapshot>(
    {
        roomName: { type: String, required: true },
        roomNumber: { type: String, required: true },
        floor: { type: Number, required: true },
        capacity: { type: Number, required: true },
        slotLabel: { type: String, required: true },
        slotStart: { type: String, required: true },
        slotEnd: { type: String, required: true },
    },
    { _id: false }                      // embedded, no separate _id
);

const BookingSchema = new Schema<IBooking>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        roomId: {
            type: Schema.Types.ObjectId,
            ref: "Room",
            required: true,
        },
        slotId: {
            type: Schema.Types.ObjectId,
            ref: "TimeSlot",
            required: true,
        },
        date: {
            type: Date,
            required: true,
        },
        dateString: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        status: {
            type: String,
            enum: ["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
            default: "CONFIRMED",
        },
        snapshot: {
            type: BookingSnapshotSchema,
            required: true,
        },
        cancelledAt: Date,
        cancelledBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        cancellationReason: String,
    },
    {
        timestamps: true,
    }
);

// Prevent double-booking at the DB level
BookingSchema.index(
    { roomId: 1, dateString: 1, slotId: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "CONFIRMED" },
        name: "unique_active_booking",
    }
);

// Fast lookup for "what's booked on this date"
BookingSchema.index({ dateString: 1, status: 1 });

// Fast lookup for "my bookings"
BookingSchema.index({ userId: 1, status: 1, date: 1 });

// Admin: all bookings for a room
BookingSchema.index({ roomId: 1, date: 1 });

export const Booking: Model<IBooking> =
    mongoose.models.Booking ||
    mongoose.model<IBooking>("Booking", BookingSchema);