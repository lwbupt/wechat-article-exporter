/**
 * 分类数据模型
 */

import db from '../index';

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at?: string;
  children?: Category[];
}

/**
 * 获取所有分类（扁平列表）
 */
export function getAllCategories(): Category[] {
  const stmt = db.prepare('SELECT * FROM categories ORDER BY parent_id ASC, sort_order ASC, name ASC');
  return stmt.all() as Category[];
}

/**
 * 获取分类树形结构
 */
export function getCategoriesTree(): Category[] {
  const flat = getAllCategories();
  const map = new Map<number, Category>();
  const roots: Category[] = [];

  for (const item of flat) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of flat) {
    const node = map.get(item.id)!;
    if (item.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(item.parent_id);
      if (parent) {
        parent.children!.push(node);
      }
    }
  }

  return roots;
}

/**
 * 根据 ID 获取分类
 */
export function getCategoryById(id: number): Category | null {
  const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
  return stmt.get(id) as Category | null;
}

/**
 * 添加分类
 */
export function insertCategory(name: string, parentId: number | null): void {
  if (parentId !== null) {
    const parent = getCategoryById(parentId);
    if (!parent) {
      throw new Error('一级分类不存在');
    }
  }

  // 获取同级别最大排序值
  const maxSort = db
    .prepare('SELECT MAX(sort_order) as max_sort FROM categories WHERE parent_id IS ?')
    .get(parentId) as { max_sort: number | null };

  const sortOrder = (maxSort?.max_sort ?? -1) + 1;
  db.prepare('INSERT INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)').run(name, parentId, sortOrder);
}

/**
 * 更新分类
 */
export function updateCategory(id: number, name: string, parentId: number | null, sortOrder?: number): void {
  const updates: string[] = [];
  const values: any[] = [];

  updates.push('name = ?');
  values.push(name);

  if (parentId !== undefined) {
    updates.push('parent_id = ?');
    values.push(parentId);
  }

  if (sortOrder !== undefined) {
    updates.push('sort_order = ?');
    values.push(sortOrder);
  }

  values.push(id);
  db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * 删除分类（级联删除子分类）
 */
export function deleteCategory(id: number): void {
  // 先删除子分类
  const children = getCategoryChildren(id);
  for (const child of children) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(child.id);
  }
  // 再删除自身
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

/**
 * 获取子分类列表
 */
export function getCategoryChildren(parentId: number): Category[] {
  const stmt = db.prepare('SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order, name');
  return stmt.all(parentId) as Category[];
}
