import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMessage extends Document {
    role: "user" | "assistant" | "system";
    content: string;
    type: "TEXT" | "RESULT" | "ERROR";
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
    {
        role: {
            type: String,
            enum: ["user", "assistant", "system"],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
type: {
            type: String,
            enum: ["TEXT", "RESULT", "ERROR"],
            default: "TEXT",
        },
    },
    {
        timestamps: true
    }
);

MessageSchema.index({ createdAt: -1 });

export const Message: Model<IMessage> =
    mongoose.models.Message ||
    mongoose.model<IMessage>("Message", MessageSchema);