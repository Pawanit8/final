import UserModel from "../model/UserModel.js";
import webpush from "../utils/webPush.js";

export const sendPushToUser = async (userId, notificationData) => {
  const user = await UserModel.findById(userId);

  if (!user || !user.pushSubscription) {
    console.log("User or subscription not found");
    return;
  }

  const payload = JSON.stringify({
    title: notificationData.title,
    body: notificationData.body,
  });

  try {
    await webpush.sendNotification(user.pushSubscription, payload);
    console.log("Push sent");
  } catch (error) {
    console.error("Push error:", error);
  }
};
