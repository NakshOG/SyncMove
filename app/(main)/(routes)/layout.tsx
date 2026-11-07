import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";

const MainLayout = async ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-full min-h-0">
      <div className="fixed inset-y-0 z-30 flex h-full w-[72px] flex-col">
        <NavigationSidebar />
      </div>
      <main className="h-full min-h-0 pl-[72px]">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;