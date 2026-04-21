import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    department?: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        department: {
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

UserSchema.index({ email: 1 }, { unique: true });

export const User: Model<IUser> =
    mongoose.models.User || mongoose.model<IUser>("User", UserSchema);