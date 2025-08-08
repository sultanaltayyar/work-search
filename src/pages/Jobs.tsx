import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// أنواع الحالة والقيم العربية

type Status =
  | "new"
  | "review"
  | "accepted"
  | "rejected"
  | "waiting";


const STATUS_LABELS: Record<Status, string> = {
  new: "جديد",
  review: "قيد المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض",
  waiting: "بانتظار الرد",
};

const ARABIC_TO_STATUS: Record<string, Status> = Object.fromEntries(
  (Object.entries(STATUS_LABELS) as [Status, string][]).map(([k, v]) => [
    v,
    k,
  ])
) as Record<string, Status>;

// نوع الطلب
type Application = {
  id: string;
  companyName: string;
  jobTitle: string;
  appliedAt: string; // ISO date
  expectedSalary?: number | null;
  status: Status;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  jobLink?: string;
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const STORAGE_KEY = "jobs.applications.v1";

function loadApplications(): Application[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Application[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveApplications(items: Application[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// مخطط التحقق للنموذج
const formSchema = z.object({
  companyName: z.string().min(1, "اسم الشركة مطلوب"),
  jobTitle: z.string().min(1, "المسمى الوظيفي مطلوب"),
  appliedAt: z.string().min(1, "تاريخ التقديم مطلوب"),
  expectedSalary: z
    .union([z.string().optional(), z.number().optional()])
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || !Number.isNaN(v), {
      message: "أدخل رقمًا صحيحًا",
    }),
  status: z.custom<Status>((val) =>
    ["new", "review", "accepted", "rejected", "waiting"].includes(
      String(val)
    )
  , { message: "الحالة مطلوبة" }) as z.ZodType<Status>,
  contactName: z.string().optional(),
  contactEmail: z.string().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  jobLink: z.string().url("رابط غير صالح").optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// أدوات مساعدة
function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ar-EG");
  } catch {
    return iso;
  }
}

function statusToArabic(s: Status) {
  return STATUS_LABELS[s];
}

function arabicToStatus(label: string): Status | null {
  return ARABIC_TO_STATUS[label] ?? null;
}

export default function Jobs() {
  const { toast } = useToast();

  // SEO
  useEffect(() => {
    const title = "لوحة متابعة طلبات التوظيف";
    document.title = title;
    const desc = "إدارة طلبات التوظيف: إضافة، تعديل، حذف، بحث، تصفية، واستيراد/تصدير إكسل";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.origin + "/jobs");
  }, []);

  // البيانات
  const [items, setItems] = useState<Application[]>(() => loadApplications());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    saveApplications(items);
  }, [items]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const byCompany = it.companyName
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      const byStatus = statusFilter === "all" || it.status === statusFilter;
      return byCompany && byStatus;
    });
  }, [items, search, statusFilter]);

  // النموذج
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      jobTitle: "",
      appliedAt: new Date().toISOString().slice(0, 10),
      expectedSalary: null,
      status: "applied",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      jobLink: "",
      notes: "",
    },
  });

  const openForNew = () => {
    setEditing(null);
    form.reset({
      companyName: "",
      jobTitle: "",
      appliedAt: new Date().toISOString().slice(0, 10),
      expectedSalary: null,
      status: "applied",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      jobLink: "",
      notes: "",
    });
    setOpen(true);
  };

  const openForEdit = (it: Application) => {
    setEditing(it);
    form.reset({
      companyName: it.companyName,
      jobTitle: it.jobTitle,
      appliedAt: it.appliedAt.slice(0, 10),
      expectedSalary: it.expectedSalary ?? null,
      status: it.status,
      contactName: it.contactName ?? "",
      contactEmail: it.contactEmail ?? "",
      contactPhone: it.contactPhone ?? "",
      jobLink: it.jobLink ?? "",
      notes: it.notes ?? "",
    });
    setOpen(true);
  };

  function sendEmailNotification(oldItem: Application, newItem: Application) {
    // اختَر المرسل إليه
    const to = newItem.contactEmail || "";
    if (!to) {
      toast({
        title: "تنبيه",
        description: "لا يوجد بريد لجهة الاتصال لإرسال الإشعار",
      });
      return;
    }

    const subject = `تحديث حالة طلب وظيفي - ${newItem.companyName}`;
    const bodyLines = [
      `مرحبًا ${newItem.contactName || ""}`.trim(),
      "",
      `تم تحديث حالة الطلب الخاص بوظيفة ${newItem.jobTitle} لدى ${newItem.companyName}.`,
      `الحالة القديمة: ${statusToArabic(oldItem.status)}`,
      `الحالة الجديدة: ${statusToArabic(newItem.status)}`,
      newItem.jobLink ? `رابط الإعلان: ${newItem.jobLink}` : "",
      `تاريخ التقديم: ${formatDate(newItem.appliedAt)}`,
      "",
      "مع خالص التحية",
    ].filter(Boolean);

    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(bodyLines.join("\n"))}`;

    // فتح عميل البريد لدى المستخدم
    window.location.href = href;

    toast({ title: "تم تحضير رسالة البريد", description: `إلى: ${to}` });
  }

  const onSubmit = (values: FormValues) => {
    const now = new Date().toISOString();
    if (editing) {
      const updated: Application = {
        ...editing,
        ...values,
        expectedSalary:
          values.expectedSalary === null ? null : Number(values.expectedSalary),
        appliedAt: new Date(values.appliedAt).toISOString(),
        updatedAt: now,
      };
      setItems((prev) => {
        const next = prev.map((p) => (p.id === editing.id ? updated : p));
        // إشعار بريدي عند تغيير الحالة
        if (editing.status !== updated.status) {
          try {
            sendEmailNotification(editing, updated);
          } catch {}
        }
        return next;
      });
      toast({ title: "تم تحديث السجل" });
    } else {
      const newItem: Application = {
        id: crypto.randomUUID(),
        companyName: values.companyName,
        jobTitle: values.jobTitle,
        appliedAt: new Date(values.appliedAt).toISOString(),
        expectedSalary:
          values.expectedSalary === null ? null : Number(values.expectedSalary),
        status: values.status,
        contactName: values.contactName || undefined,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
        jobLink: values.jobLink || undefined,
        notes: values.notes || undefined,
        createdAt: now,
        updatedAt: now,
      };
      setItems((prev) => [newItem, ...prev]);
      toast({ title: "تمت إضافة سجل جديد" });
    }
    setOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    setItems((prev) => prev.filter((p) => p.id !== id));
    toast({ title: "تم حذف السجل" });
  };

  const handleExport = () => {
    const rows = items.map((it) => ({
      "اسم الشركة": it.companyName,
      "المسمى الوظيفي": it.jobTitle,
      "تاريخ التقديم": formatDate(it.appliedAt),
      "الراتب المتوقع": it.expectedSalary ?? "",
      "الحالة": statusToArabic(it.status),
      "الاسم": it.contactName ?? "",
      "البريد الإلكتروني": it.contactEmail ?? "",
      "الهاتف": it.contactPhone ?? "",
      "رابط الإعلان": it.jobLink ?? "",
      "ملاحظات": it.notes ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "طلبات");
    XLSX.writeFile(wb, "طلبات_التوظيف.xlsx");
    toast({ title: "تم تصدير الملف" });
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      const imported: Application[] = json
        .map((row) => {
          const statusLabel = String(row["الحالة"] ?? "").trim();
          const status = arabicToStatus(statusLabel);
          if (!status) return null;

          const appliedAtStr = String(row["تاريخ التقديم"] ?? "").trim();
          const appliedAt = appliedAtStr
            ? new Date(appliedAtStr).toISOString()
            : new Date().toISOString();

          const expectedSalaryRaw = row["الراتب المتوقع"]; // قد يكون رقمًا أو نصًا
          const expectedSalary = expectedSalaryRaw === undefined || expectedSalaryRaw === ""
            ? null
            : Number(expectedSalaryRaw);

          return {
            id: crypto.randomUUID(),
            companyName: String(row["اسم الشركة"] ?? "").trim(),
            jobTitle: String(row["المسمى الوظيفي"] ?? "").trim(),
            appliedAt,
            expectedSalary: Number.isNaN(expectedSalary) ? null : expectedSalary,
            status,
            contactName: String(row["الاسم"] ?? "").trim() || undefined,
            contactEmail: String(row["البريد الإلكتروني"] ?? "").trim() || undefined,
            contactPhone: String(row["الهاتف"] ?? "").trim() || undefined,
            jobLink: String(row["رابط الإعلان"] ?? "").trim() || undefined,
            notes: String(row["ملاحظات"] ?? "").trim() || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Application;
        })
        .filter(Boolean) as Application[];

      setItems((prev) => [...imported, ...prev]);
      toast({ title: "تم الاستيراد", description: `${imported.length} سجلات` });
    } catch (err) {
      console.error(err);
      toast({ title: "فشل الاستيراد", description: "تحقق من تنسيق الملف", variant: "destructive" });
    } finally {
      // إعادة تعيين قيمة الملف للسماح باستيراد نفس الملف لاحقًا
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-2xl md:text-3xl font-bold">لوحة متابعة طلبات التوظيف</h1>
          <p className="text-sm text-muted-foreground mt-1">
            أضف، عدّل، احذف، ابحث وصدّر/استورد بيانات طلبات التوظيف
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <section className="mb-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-sm mb-1">ابحث باسم الشركة</label>
            <Input
              placeholder="اكتب اسم الشركة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm mb-1">تصفية حسب الحالة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(
                  [
                    "applied",
                    "review",
                    "interview",
                    "offer",
                    "rejected",
                    "internal",
                  ] as Status[]
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusToArabic(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end">
            <Button variant="secondary" onClick={handleImportClick}>
              استيراد إكسل
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleImportFile}
            />
            <Button variant="outline" onClick={handleExport}>
              تصدير إكسل
            </Button>
            <Button onClick={openForNew}>إضافة طلب</Button>
          </div>
        </section>

        <section className="rounded-md border border-border overflow-hidden">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">اسم الشركة</TableHead>
                <TableHead>المسمى الوظيفي</TableHead>
                <TableHead>تاريخ التقديم</TableHead>
                <TableHead>الراتب المتوقع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>جهة الاتصال</TableHead>
                <TableHead>رابط الإعلان</TableHead>
                <TableHead>ملاحظات</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.companyName}</TableCell>
                  <TableCell>{it.jobTitle}</TableCell>
                  <TableCell>{formatDate(it.appliedAt)}</TableCell>
                  <TableCell>{it.expectedSalary ?? "-"}</TableCell>
                  <TableCell>{statusToArabic(it.status)}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {it.contactName && <div>{it.contactName}</div>}
                      {it.contactEmail && (
                        <div className="text-muted-foreground">{it.contactEmail}</div>
                      )}
                      {it.contactPhone && (
                        <div className="text-muted-foreground">{it.contactPhone}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {it.jobLink ? (
                      <a
                        href={it.jobLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        فتح الرابط
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={it.notes}>
                    {it.notes || "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openForEdit(it)}>
                        تعديل
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(it.id)}>
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    لا توجد سجلات مطابقة
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </main>

      {/* نموذج الإضافة/التعديل */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل سجل" : "إضافة سجل جديد"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الشركة</FormLabel>
                    <FormControl>
                      <Input placeholder="مثلًا: شركة س" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المسمى الوظيفي</FormLabel>
                    <FormControl>
                      <Input placeholder="مثلًا: مطوّر Frontend" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="appliedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>تاريخ التقديم</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expectedSalary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الراتب المتوقع</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" placeholder="اختياري" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الحالة</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر الحالة" />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            [
                              "applied",
                              "review",
                              "interview",
                              "offer",
                              "rejected",
                              "internal",
                            ] as Status[]
                          ).map((s) => (
                            <SelectItem key={s} value={s}>
                              {statusToArabic(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم جهة الاتصال</FormLabel>
                    <FormControl>
                      <Input placeholder="اختياري" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>البريد الإلكتروني لجهة الاتصال</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="اختياري" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>هاتف جهة الاتصال</FormLabel>
                    <FormControl>
                      <Input placeholder="اختياري" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jobLink"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>رابط الإعلان</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="اختياري" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>ملاحظات</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="اختياري" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="md:col-span-2">
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    إلغاء
                  </Button>
                  <Button type="submit">حفظ</Button>
                </DialogFooter>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
