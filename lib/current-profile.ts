import {auth} from "@clerk/nextjs/server";
import {db} from "@/lib/db";
import { error } from "console";

export const currentProfile = async () => {
  const {userId} = await auth();
  if(!userId){
    return null;
  } 
  const profile= await db.profile.findUnique({
    where:{
      userId:userId
    }
});
if(!profile){
    error("Profile not found for userId");
  return null;
}
return profile;

}