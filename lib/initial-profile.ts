import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";

export const initialProfile = async () => {

  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const user = await currentUser();

  if (!user) {
    return null;
  }
  const profile = await db.profile.findUnique({
    where: {
      userId: userId,
    },
  });

  if (profile) {
    return profile;
  }

  const newProfile = await db.profile.create({
    data: {
      userId: userId,
      name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
      imageUrl: user.imageUrl,
      email: user.emailAddresses[0]?.emailAddress ?? "",
    },
  });

  return newProfile;
};