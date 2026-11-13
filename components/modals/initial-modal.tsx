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

const DEFAULT_SERVER_IMAGE =
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80";

const formSchema = z.object({
  name: z.string().min(1, {
    message: "Server name is required.",
  }),
});

export const InitialModal = () => {
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      const response = await axios.post("/api/servers", {
        ...values,
        imageUrl: DEFAULT_SERVER_IMAGE,
      });

      form.reset();
      router.push(`/servers/${response.data.id}`);
      router.refresh();
    } catch (err) {
      console.error("Error creating server:", err);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="bg-[#2b2d31] text-white p-0 overflow-hidden rounded-xl border border-white/5"
      >
        <DialogHeader className="pt-8 px-6">
          <DialogTitle className="text-2xl text-center font-bold">
            Customize your server
          </DialogTitle>

          <DialogDescription className="text-center text-[#949ba4]">
            Give your server a name. You can change it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 pb-6">
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    htmlFor="server-name"
                    className="uppercase text-xs font-bold text-[#949ba4]"
                  >
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
