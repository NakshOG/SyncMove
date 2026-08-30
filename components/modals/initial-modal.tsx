"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

import { Input } from "@/components/ui/input";
import { Button } from "../ui/button";
import { useEffect, useState } from "react";
import { FileUpload } from "../ui/file-upload";

const formSchema = z.object({
  name: z.string().min(1, {
    message: "Server name is required.",
  }),

  imageUrl: z.string().min(1, {
    message: "Server image is required.",
  }),
});

export const InitialModal = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),

    defaultValues: {
      name: "",
      imageUrl: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    console.log(values);
  };

  if (!isMounted) return null;

  return (
    <Dialog open >
      <DialogContent className="bg-zinc-900 text-white p-0 overflow-hidden">
        <DialogHeader className="pt-8 px-6">
          <DialogTitle className="text-2xl text-center font-bold">
            Customize your server
          </DialogTitle>

          <DialogDescription className="text-center text-zinc-400">
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
                    onchange={field.onChange}
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
                  <FieldLabel className="uppercase text-xs font-bold text-zinc-400">
                    Server name
                  </FieldLabel>

                  <Input
                    {...field}
                    id="server-name"
                    placeholder="Your Server Name"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    disabled={isLoading}
                    className="bg-zinc-800/50 border-0 focus-visible:ring-0 text-white focus-visible:ring-offset-0 placeholder:text-zinc-500 caret-white"
                  />

                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

          </FieldGroup>

          <DialogFooter className="bg-zinc-800 px-6 py-4 rounded-lg mt-6">
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
