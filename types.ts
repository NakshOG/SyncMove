import { Member, Profile, Server } from "./generated/prisma/client"

export type ServerWithMembersWithProfile = Server & {
members:(Member & {profile:Profile})[]
}