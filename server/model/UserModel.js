import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  }
}, { _id: false }); // No _id for embedded object

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phone: { type: String },
  gender: { type: String, enum: ["Male", "Female", "Other", "Prefer not to say"] },
  dob: { type: Date },
  age: { type: Number },
  profilePicture: { type: String },
  role: { type: String, enum: ["Admin", "Student", "Driver"], default: "Student" },

  // Push notification subscription
  pushSubscription: pushSubscriptionSchema,

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const UserModel = mongoose.model("User", UserSchema);

export default UserModel;
