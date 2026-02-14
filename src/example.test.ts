import { Collection, Entity, ManyToMany, MikroORM, OneToOne, PrimaryKey, Property, Ref } from '@mikro-orm/sqlite';

@Entity()
class Tag {
    @PrimaryKey()
    id!: number;

    @Property()
    name!: string;
}

@Entity()
class Questions {
    @PrimaryKey()
    id!: number;

    @Property()
    text!: string;

    @Property()
    answer!: string;

    @ManyToMany({
        entity: () => Tag,
        pivotTable: 'question_tags',
        joinColumn: 'question_id',
        inverseJoinColumn: 'tag_id',
    })
    tags = new Collection<Tag>(this);
}

@Entity()
class ReferenceMaterials {
    @PrimaryKey()
    id!: number;

    @Property()
    text!: string;

    @ManyToMany({
        entity: () => Tag,
        pivotTable: 'reference_material_tags',
        joinColumn: 'reference_material_id',
        inverseJoinColumn: 'tag_id',
    })
    tags = new Collection<Tag>(this);
}

@Entity({
    expression: `SELECT
            id as question_id,
            NULL as reference_material_id,
            CONCAT('questions-', id) as id
            FROM questions
            UNION ALL
            SELECT
            NULL as question_id,
            id as reference_material_id,
            CONCAT('reference_materials-', id) as id
            FROM reference_materials`
    ,
})
class SearchResults {
    @Property({ type: 'text' })
    id!: string;

    @OneToOne({ entity: () => Questions, joinColumn: 'question_id', nullable: true, ref: true })
    question?: Ref<Questions>;

    @OneToOne({ entity: () => ReferenceMaterials, joinColumn: 'reference_material_id', nullable: true, ref: true })
    referenceMaterial?: Ref<ReferenceMaterials>;
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    dbName: ':memory:',
    entities: [Tag, Questions, ReferenceMaterials, SearchResults],
    debug: ['query', 'query-params'],
    allowGlobalContext: true, // only for testing
  });
  await orm.schema.refreshDatabase();
});

afterAll(async () => {
  await orm.close(true);
});

test('virtual entity: filtering through nested ManyToMany works when no limit applied', async () => {
    const em = orm.em.fork();

    const tag = em.create(Tag, { name: 'geography' });
    const question = em.create(Questions, { text: 'What is the capital of France?', answer: 'Paris' });
    const referenceMaterial = em.create(ReferenceMaterials, { text: 'France is a country in Europe.' });

    question.tags.add(tag);
    referenceMaterial.tags.add(tag);

    await em.flush();
    const [results, count] = await em.fork().findAndCount(
        SearchResults,
        {
            $or: [
                { question: { tags: { name: 'geography' } } },
                { referenceMaterial: { tags: { name: 'geography' } } },
            ],
        },
        {
            populate: ['question', 'referenceMaterial', 'question.tags', 'referenceMaterial.tags'],
        }
    );

    expect(results).toHaveLength(2);
    expect(count).toBe(2);
});

test('virtual entity: filtering through nested ManyToMany produces empty column identifier', async () => {
    const em = orm.em.fork();

    const tag = em.create(Tag, { name: 'geography' });
    const question = em.create(Questions, { text: 'What is the capital of France?', answer: 'Paris' });
    const referenceMaterial = em.create(ReferenceMaterials, { text: 'France is a country in Europe.' });

    question.tags.add(tag);
    referenceMaterial.tags.add(tag);

    await em.flush();

    // Query the virtual entity, filtering through OneToOne -> ManyToMany relationships.
    // No formula-based relationships are involved — all joins are standard.
    //
    // Expected: MikroORM resolves the virtual entity's `id` column for subquery correlation
    // Actual: Produces WHERE "s0"."" IN (...) — empty column identifier
    const [results, count] = await em.fork().findAndCount(
        SearchResults,
        {
            $or: [
                { question: { tags: { name: 'geography' } } },
                { referenceMaterial: { tags: { name: 'geography' } } },
            ],
        },
        {
            limit: 10,
            populate: ['question', 'referenceMaterial', 'question.tags', 'referenceMaterial.tags'],
        }
    );

    expect(results).toHaveLength(2);
    expect(count).toBe(2);
});