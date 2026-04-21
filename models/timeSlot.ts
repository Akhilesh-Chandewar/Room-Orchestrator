import mongoose, { Document, Model, Schema } from "mongoose";

export interface ITimeSlot extends Document {
    _id: mongoose.Types.ObjectId;
    label: string;                 // "9:00 AM – 10:00 AM"
    startTime: string;             // "09:00"
    endTime: string;               // "10:00"
    startMinutes: number;          // 540  (for easy sorting/comparison)
    endMinutes: number;            // 600
    durationMinutes: number;       // 60
    isActive: boolean;
}

const TimeSlotSchema = new Schema<ITimeSlot>({
    label: {
        type: String,
        required: true,
        unique: true,
    },
    startTime: {
        type: String,
        required: true,
        match: /^\d{2}:\d{2}$/,
    },
    endTime: {
        type: String,
        required: true,
        match: /^\d{2}:\d{2}$/,
    },
    startMinutes: {
        type: Number,
        required: true,
    },
    endMinutes: {
        type: Number,
        required: true,
    },
    durationMinutes: {
        type: Number,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
});

TimeSlotSchema.index({ startMinutes: 1 });

export const TimeSlot: Model<ITimeSlot> =
    mongoose.models.TimeSlot ||
    mongoose.model<ITimeSlot>("TimeSlot", TimeSlotSchema);