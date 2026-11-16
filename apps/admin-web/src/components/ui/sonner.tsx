import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps): React.JSX.Element {
  return (
    <Sonner
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast: "font-sans",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
