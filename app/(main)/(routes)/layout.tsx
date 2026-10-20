import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";
import { MobileNavigation } from "@/components/navigation/mobile-navigation";

const MainLayout = async ({ children }: { children: React.ReactNode }) => {
    return (
    <div className="h-full min-h-0">
      <div className="hidden md:flex h-full w-[72px]
      z-30 flex-col fixed inset-y-0">
      <NavigationSidebar />
      </div>
      <main className="h-full min-h-0 pb-16 md:pl-[72px] md:pb-0">
        {children}
      </main>
      <MobileNavigation />
    </div>
  );
}
export default MainLayout;
