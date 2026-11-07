"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import axios from "axios";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "../ui/button";
import { FileUpload } from "../ui/file-upload";
import { useModal } from "@/hooks/use-modal-store";

const formSchema = z.object({
  name: z.string().min(1, {
    message: "Server name is required.",
  }),

  imageUrl: z.string().min(1, {
    message: "Server image is required.",
  }),
});

export const CreateServerModal = () => {
  const {isOpen,onClose,type}=useModal()
  const router=useRouter();

  const isModalOpen = isOpen && type === "createServer";
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      imageUrl: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
try{
  await axios.post("/api/servers", values);
  form.reset();
  router.refresh();
  onClose();
}catch(err){
console.log("Error creating server:", err);
}

  };

  const handleclose=()=>{
    form.reset();
    onClose();
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={handleclose}>
      <DialogContent className="bg-[#2b2d31] text-white p-0 overflow-hidden rounded-xl border border-white/5">
        <DialogHeader className="pt-8 px-6">
          <DialogTitle className="text-2xl text-center font-bold">
            Customize your server
          </DialogTitle>

          <DialogDescription className="text-center text-[#949ba4]">
            Give your server a name and image. You can change it later.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="px-6 pb-6"
        >
          <FieldGroup>
            {/* IMAGEN*/}
            <Controller
              name="imageUrl"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                    <FileUpload
                    endpoint="ServerImage"
                    value={field.value}
                    onChange={field.onChange}
                    />
                 {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* SERVER NAME */}
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel className="uppercase text-xs font-bold text-[#949ba4]">
                    Server name
                  </FieldLabel>

                  <Input
                    {...field}
                    id="server-name"
                    placeholder="Your Server Name"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    disabled={isLoading}
                    className="rounded-xl bg-[#383a40] border-0 focus-visible:ring-1 focus-visible:ring-[#5865f2] text-white placeholder:text-[#949ba4]"
                  />

                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

          </FieldGroup>

          <DialogFooter className="bg-[#232428] px-6 py-4 rounded-xl mt-6">
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
              className="rounded-xl"
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};