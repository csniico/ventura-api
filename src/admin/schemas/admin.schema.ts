import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { nanoid } from 'nanoid';

export type AdminDocument = HydratedDocument<Admin>;

@Schema({ timestamps: true, collection: 'admins' })
export class Admin {
  // _id is created automatically by MongoDB (ObjectId).

  @Prop({ required: true, unique: true, default: () => nanoid(8) })
  shortId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true })
  email!: string;

  // No password / role / profile picture yet — the auth flow (verification
  // emails) will be added later.

  // createdAt / updatedAt are added automatically by { timestamps: true }.
}

export const AdminSchema = SchemaFactory.createForClass(Admin);
