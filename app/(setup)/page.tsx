import { initialProfile } from "@/lib/initial-profile";
import { redirect } from "next/navigation";

const SetupPage = async () => {
await initialProfile();

return redirect("/servers");
}
export default SetupPage;
