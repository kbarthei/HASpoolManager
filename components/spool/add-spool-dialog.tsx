"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Camera, BookOpen, Copy, Plus } from "lucide-react";
import { AddSpoolScan } from "./add-spool-scan";
import { AddSpoolLibrary } from "./add-spool-library";
import { AddSpoolClone } from "./add-spool-clone";

type FilamentOption = {
  id: string;
  name: string;
  material: string;
  colorHex: string | null;
  colorName: string | null;
  vendor: { name: string };
};

type SpoolOption = {
  id: string;
  remainingWeight: number;
  initialWeight: number;
  location: string | null;
  status: string;
  filament: {
    name: string;
    material: string;
    colorHex: string | null;
    colorName: string | null;
    vendor: { name: string };
  };
};

export function AddSpoolDialog({
  filaments = [],
  spools = [],
}: {
  filaments?: FilamentOption[];
  spools?: SpoolOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" data-testid="btn-add-spool" className="h-7 text-xs px-2.5" />
        }
      >
        <Plus className="size-3.5 mr-1" />
        Add Spool
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Spool</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="library">
          <TabsList className="w-full">
            <TabsTrigger value="scan" className="flex-1 gap-1">
              <Camera className="size-3.5" />
              <span className="hidden sm:inline">Scan</span>
            </TabsTrigger>
            <TabsTrigger value="library" className="flex-1 gap-1">
              <BookOpen className="size-3.5" />
              <span className="hidden sm:inline">Library</span>
            </TabsTrigger>
            <TabsTrigger value="clone" className="flex-1 gap-1">
              <Copy className="size-3.5" />
              <span className="hidden sm:inline">Clone</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="scan">
            <AddSpoolScan onSuccess={handleSuccess} />
          </TabsContent>
          <TabsContent value="library">
            <AddSpoolLibrary filaments={filaments} onSuccess={handleSuccess} />
          </TabsContent>
          <TabsContent value="clone">
            <AddSpoolClone spools={spools} onSuccess={handleSuccess} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
