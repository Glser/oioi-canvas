import { ConfigProvider, Segmented as AntSegmented, Select as AntSelect, Tooltip } from "antd";
import type { PaginationProps, SegmentedProps, SelectProps } from "antd";
import type { RefSelectProps } from "antd/es/select";
import enUS from "antd/es/locale/en_US";
import { cloneElement, isValidElement, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";

// Ant Design also generates native titles internally, even when JSX has no title prop.
export function Select<ValueType = string>({ options, value, defaultValue, onChange, open, onOpenChange, labelRender, optionRender, ...props }: SelectProps<ValueType> & { ref?: Ref<RefSelectProps> }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const selectedLabel = options?.find((option) => option.value === (value ?? uncontrolledValue))?.label;
    return (
        <Tooltip title={props.mode ? undefined : selectedLabel} open={(open ?? dropdownOpen) ? false : undefined}>
            <AntSelect
                {...props}
                value={value}
                defaultValue={defaultValue}
                open={open}
                title=""
                options={options?.map((option) => ({ ...option, title: "" }))}
                onChange={(nextValue, option) => { if (value === undefined) setUncontrolledValue(nextValue); onChange?.(nextValue, option); }}
                onOpenChange={(nextOpen) => { setDropdownOpen(nextOpen); onOpenChange?.(nextOpen); }}
                labelRender={labelRender ?? ((item) => props.mode ? (
                    <Tooltip title={item.label ?? item.value}><span className="block truncate">{item.label ?? item.value}</span></Tooltip>
                ) : <span className="block truncate">{item.label ?? item.value}</span>)}
                optionRender={optionRender ?? ((option) => <SelectOptionTooltip label={option.label} />)}
            />
        </Tooltip>
    );
}

function SelectOptionTooltip({ label }: { label: ReactNode }) {
    const labelRef = useRef<HTMLSpanElement>(null);
    // User-created tags bypass options[], so their implicit title must be cleared on mount.
    useLayoutEffect(() => { labelRef.current?.closest("[title]")?.removeAttribute("title"); }, [label]);
    return <Tooltip title={label}><span ref={labelRef} className="block truncate">{label}</span></Tooltip>;
}

export function Segmented<ValueType extends string | number = string>({ options, ...props }: SegmentedProps<ValueType> & { ref?: Ref<HTMLDivElement> }) {
    return (
        <AntSegmented
            {...props}
            options={options.map((option) => typeof option === "object" ? (
                { ...option, title: "", tooltip: option.tooltip ?? option.title ?? option.label }
            ) : { value: option, label: String(option), title: "", tooltip: String(option) })}
        />
    );
}

export const paginationTooltipProps: Pick<PaginationProps, "showTitle" | "itemRender"> = {
    showTitle: false,
    itemRender: (page, type, element) => <PaginationTooltipItem page={page} type={type}>{element}</PaginationTooltipItem>,
};

function PaginationTooltipItem({ page, type, children, disabled }: { page: number; type: Parameters<NonNullable<PaginationProps["itemRender"]>>[1]; children: ReactNode; disabled?: boolean }) {
    const { locale } = useContext(ConfigProvider.ConfigContext);
    const labels = { ...enUS.Pagination, ...locale?.Pagination };
    const title = type === "page" ? String(page) : ({ prev: labels.prev_page, next: labels.next_page, "jump-prev": labels.prev_5, "jump-next": labels.next_5 }[type]);
    const elementRef = useRef<HTMLElement>(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const item = elementRef.current?.closest("li");
        if (!item) return;
        item.setAttribute("aria-label", title || "");
        const show = () => setOpen(true);
        const hide = () => setOpen(false);
        item.addEventListener("focusin", show);
        item.addEventListener("focusout", hide);
        return () => { item.removeEventListener("focusin", show); item.removeEventListener("focusout", hide); };
    }, [title]);
    return isValidElement<{ ref?: Ref<HTMLElement>; disabled?: boolean }>(children) ? (
        <Tooltip title={title} open={open} onOpenChange={setOpen}>{cloneElement(children, { ref: elementRef, disabled })}</Tooltip>
    ) : children;
}
