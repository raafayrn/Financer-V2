import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../auth/middleware';
import { asyncHandler, HttpError, parseBody } from '../lib/http';
import { serializeCategory } from '../lib/serialize';
import { categoryCreateSchema, categoryUpdateSchema } from '../validation/schemas';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: { userId: req.userId! },
      orderBy: { name: 'asc' },
    });
    res.json(categories.map(serializeCategory));
  }),
);

categoriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, color } = parseBody(categoryCreateSchema, req.body);
    const existing = await prisma.category.findUnique({
      where: { userId_name: { userId: req.userId!, name } },
    });
    if (existing) throw new HttpError(409, 'Já existe uma categoria com este nome.');

    const category = await prisma.category.create({
      data: { userId: req.userId!, name, color: color ?? undefined },
    });
    res.status(201).json(serializeCategory(category));
  }),
);

categoriesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = parseBody(categoryUpdateSchema, req.body);
    const category = await prisma.category.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!category) throw new HttpError(404, 'Categoria não encontrada.');

    // Se renomeando, garante que não colide com outra categoria do usuário.
    if (data.name && data.name !== category.name) {
      const clash = await prisma.category.findUnique({
        where: { userId_name: { userId: req.userId!, name: data.name } },
      });
      if (clash) throw new HttpError(409, 'Já existe uma categoria com este nome.');
    }

    const updated = await prisma.category.update({
      where: { id: category.id },
      data: { name: data.name, color: data.color },
    });
    res.json(serializeCategory(updated));
  }),
);

categoriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!category) throw new HttpError(404, 'Categoria não encontrada.');

    // Despesas ligadas a esta categoria ficam com categoryId = null
    // (onDelete: SetNull no schema).
    await prisma.category.delete({ where: { id: category.id } });
    res.status(204).end();
  }),
);
