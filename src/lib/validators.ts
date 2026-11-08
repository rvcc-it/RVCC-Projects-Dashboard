import { z } from "zod";
import { PROJECT_STATUSES, MEMBER_ROLES } from "@/lib/constants";

// Shared by the browser forms (React Hook Form) and the server (every action/route re-validates).

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").or(z.literal(""));
const uuidOrEmpty = z.union([z.uuid("Select a valid option"), z.literal("")]);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const projectSchema = z
  .object({
    code: z
      .string()
      .trim()
      .max(40)
      .regex(/^([A-Za-z0-9][A-Za-z0-9._-]{1,39})?$/, "Letters, digits, dot, dash and underscore only (2-40 chars) or leave blank to auto-generate"),
    name: z.string().trim().min(2, "Project name is required").max(200),
    clientName: z.string().trim().min(2, "Client name is required").max(200),
    mainContractor: z.string().trim().max(200),
    consultant: z.string().trim().max(200),
    location: z.string().trim().min(2, "Location is required").max(120),
    description: z.string().trim().max(4000),
    category: z.string().trim().min(2, "Select a category").max(80),
    projectManagerId: uuidOrEmpty,
    memberIds: z.array(z.uuid()),
    startDate: dateStr,
    expectedCompletion: dateStr,
    actualCompletion: dateStr,
    status: z.enum(PROJECT_STATUSES),
    progress: z.number("Enter a number").int("Whole numbers only").min(0).max(100),
    contractValue: z.string().trim().regex(/^(\d{1,13}(\.\d{1,2})?)?$/, "Enter a valid amount (max 2 decimals)"),
    remarks: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.expectedCompletion && v.expectedCompletion < v.startDate)
      ctx.addIssue({ code: "custom", path: ["expectedCompletion"], message: "Must be on or after the start date" });
    if (v.startDate && v.actualCompletion && v.actualCompletion < v.startDate)
      ctx.addIssue({ code: "custom", path: ["actualCompletion"], message: "Must be on or after the start date" });
  });
export type ProjectInput = z.infer<typeof projectSchema>;

export const memberSchema = z.object({
  userId: z.uuid("Select a user"),
  memberRole: z.enum(MEMBER_ROLES),
  canEdit: z.boolean(),
  canUpload: z.boolean(),
  canDeleteDocs: z.boolean(),
  canManageTeam: z.boolean(),
});
export type MemberInput = z.infer<typeof memberSchema>;

export const documentMetaSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(250),
  categoryId: z.uuid("Select a category"),
  description: z.string().trim().max(2000),
  revisionLabel: z.string().trim().max(30),
  documentDate: dateStr,
});
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  description: z.string().trim().max(500),
  sortOrder: z.number("Enter a number").int().min(0).max(100000),
  isActive: z.boolean(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail").max(200),
  username: z.string().trim().toLowerCase().max(40).regex(/^([a-z0-9._-]{3,40})?$/, "3-40 chars: a-z, 0-9, dot, dash, underscore"),
  fullName: z.string().trim().min(2, "Full name is required").max(150),
  department: z.string().trim().max(100),
  jobTitle: z.string().trim().max(100),
  phone: z.string().trim().max(40),
  roleId: z.uuid("Select a role"),
  password: z.union([passwordSchema, z.literal("")]),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = userCreateSchema.omit({ password: true }).extend({ isActive: z.boolean() });
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(150),
  department: z.string().trim().max(100),
  jobTitle: z.string().trim().max(100),
  phone: z.string().trim().max(40),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{1,40}$/, "a-z, 0-9 and underscore, starting with a letter"),
  description: z.string().trim().max(300),
});
export type RoleInput = z.infer<typeof roleSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your e-mail or username").max(200),
  password: z.string().min(1, "Enter your password").max(200),
  remember: z.boolean().optional(),
});

export const uploadFieldsSchema = documentMetaSchema.extend({ projectId: z.uuid() });
