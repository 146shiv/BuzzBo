export declare function Field({ label, children, hint, required, }: {
    label: string;
    children: React.ReactNode;
    hint?: string;
    required?: boolean;
}): import("react").JSX.Element;
export declare function Input(props: React.InputHTMLAttributes<HTMLInputElement>): import("react").JSX.Element;
export declare function SecretInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>): import("react").JSX.Element;
export declare function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): import("react").JSX.Element;
export declare function LabeledSelect({ options, value, onValueChange, }: {
    options: {
        value: string;
        label: string;
    }[];
    value: string;
    onValueChange: (v: string) => void;
}): import("react").JSX.Element;
export declare function NumberInput({ value, onChange, }: {
    value: number;
    onChange: (v: number) => void;
}): import("react").JSX.Element;
export declare function DelayPair({ label, value, onChange, }: {
    label: string;
    value: {
        min: number;
        max: number;
    };
    onChange: (v: {
        min: number;
        max: number;
    }) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=fields.d.ts.map