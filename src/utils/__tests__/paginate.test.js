const { paginate, paginateOffset, clampLimit, parseCursorFromRequest } = require("../paginate");

jest.mock("../../services/logger", () => ({ time: () => ({ end: jest.fn() }), info: jest.fn() }));

const makeModel = (items, total = items.length) => ({
  name: "TestModel",
  findMany: jest.fn().mockResolvedValue(items),
  count: jest.fn().mockResolvedValue(total)
});

describe("clampLimit", () => {
  test("clamps to max", () => { expect(clampLimit(9999)).toBe(100); });
  test("clamps to min", () => { expect(clampLimit(0)).toBe(1); });
  test("returns default for NaN", () => { expect(clampLimit("abc")).toBe(20); });
});

describe("paginate", () => {
  test("returns data and meta", async () => {
    const model = makeModel([{ id: 1 }, { id: 2 }]);
    const result = await paginate(model, { limit: 10 });
    expect(result.data).toHaveLength(2);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.nextCursor).toBeNull();
  });
  test("detects hasMore when extra item returned", async () => {
    const model = makeModel([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const result = await paginate(model, { limit: 2 });
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.nextCursor).toBe("2");
    expect(result.data).toHaveLength(2);
  });

  test("maintains stable ordering and no duplicates under concurrent writes (regression #87)", async () => {
    // 1. Initial data state (ordered DESC by id)
    const initialData = [
      { id: 3 },
      { id: 2 },
      { id: 1 }
    ];
    
    let dbState = [...initialData];
    
    // Mock model that respects limit and cursor
    const mockModel = {
      name: "TestModel",
      findMany: jest.fn().mockImplementation(async (query) => {
        let items = [...dbState];
        items.sort((a, b) => b.id - a.id);
        
        if (query.cursor && query.cursor.id) {
          items = items.filter(item => item.id < query.cursor.id);
        }
        
        return items.slice(0, query.take);
      })
    };

    // 2. Fetch first page (limit 2)
    const page1 = await paginate(mockModel, { limit: 2 });
    
    expect(page1.data).toHaveLength(2);
    expect(page1.data[0].id).toBe(3);
    expect(page1.data[1].id).toBe(2);
    expect(page1.meta.hasMore).toBe(true);
    expect(page1.meta.nextCursor).toBe("2");

    // 3. Simulate concurrent write: a new record is added before the next fetch
    dbState.push({ id: 4 });
    
    // 4. Fetch second page using the cursor from page 1
    const page2 = await paginate(mockModel, { 
      limit: 2,
      cursor: parseInt(page1.meta.nextCursor, 10) 
    });
    
    // ID 4 is skipped (it's > cursor 2). We don't get duplicates of 2. We only get 1.
    expect(page2.data).toHaveLength(1);
    expect(page2.data[0].id).toBe(1);
    expect(page2.meta.hasMore).toBe(false);
  });
});

describe("paginateOffset", () => {
  test("returns pagination meta", async () => {
    const model = makeModel([{ id: 1 }], 50);
    const result = await paginateOffset(model, { page: 2, limit: 10 });
    expect(result.meta.total).toBe(50);
    expect(result.meta.totalPages).toBe(5);
    expect(result.meta.hasPrev).toBe(true);
    expect(result.meta.hasNext).toBe(true);
  });
});
