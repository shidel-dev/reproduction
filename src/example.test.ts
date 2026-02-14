import { Entity, ManyToOne, MikroORM, Opt, PrimaryKey, Property, Ref } from '@mikro-orm/sqlite';

@Entity()
class Owner {
    @PrimaryKey()
    id!: number;

    @Property()
    name!: string;
}

@Entity()
class Folder {
    @PrimaryKey()
    id!: number;

    @Property()
    name!: string;

    @Property({persist: false})
    ownerId!: number & Opt;

    @ManyToOne(() => Owner)
    owner!: Ref<Owner>;
}

@Entity()
class Questions {
    @PrimaryKey()
    id!: number;

    @Property()
    text!: string;

    @Property()
    answer!: string;

    @ManyToOne(() => Owner)
    owner!: Ref<Owner>;

    @Property({persist: false})
    ownerId!: number & Opt;

    @ManyToOne(() => Folder, { nullable: true })
    folder?: Ref<Folder>;
}


let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    dbName: ':memory:',
    entities: [Owner, Folder, Questions],
    debug: ['query', 'query-params'],
    allowGlobalContext: true, // only for testing
  });
  await orm.schema.refreshDatabase();
});

afterAll(async () => {
  await orm.close(true);
});

test('column name should be prefixed with alias', async () => {
    const em = orm.em.fork();
    const owner = em.create(Owner, { name: 'Test Owner' });
    const folder = em.create(Folder, { name: 'Test Folder', owner });
    const question1 = em.create(Questions, { text: 'Question 1', answer: 'Answer 1', owner, folder });
    const question2 = em.create(Questions, { text: 'Question 2', answer: 'Answer 2', owner, folder });
    em.persist(folder).persist(owner).persist(question1).persist(question2);
    await em.flush();

    const result = await em.fork().find(Questions, {
      ownerId: owner.id,
    }, {
      populate: ['owner', 'folder'],
    })

    expect(result).toHaveLength(2);
});
