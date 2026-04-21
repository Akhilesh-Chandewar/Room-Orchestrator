import mongoose, { Document, Model, Schema } from "mongoose";

export interface IRoom extends Document {
    _id: mongoose.Types.ObjectId;
    roomNumber: string;            // e.g. "101", "B2"
    capacity: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>(
    {
        roomNumber: {
            type: String,
            required: true,
            unique: true,
        },
        capacity: {
            type: Number,
            required: true,
            min: 1,
            max: 100,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

RoomSchema.index({ capacity: 1 });
RoomSchema.index({ isActive: 1, capacity: 1 });

export const Room: Model<IRoom> =
    mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);