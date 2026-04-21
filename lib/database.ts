import mongoose from "mongoose";

interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

declare global {
    var mongoose: MongooseCache | undefined;
}

if (!global.mongoose) {
    global.mongoose = { conn: null, promise: null };
}

const cached = global.mongoose;

mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected');
});

export default async function connectToDatabase() {
    if (cached.conn) {
        return cached.conn;
    }

    const MONGODB_URL = process.env.MONGODB_URL;

    if (!MONGODB_URL) {
        throw new Error("Please define the MONGODB_URL environment variable");
    }

    if (!cached.promise) {
        const options = {
            bufferCommands: false,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };

        cached.promise = mongoose.connect(MONGODB_URL, options).then((mongoose) => {
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}