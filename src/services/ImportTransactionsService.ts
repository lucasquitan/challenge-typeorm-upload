import { getRepository, getCustomRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(path: string): Promise<Transaction[]> {
    const transactionsRepositories = getCustomRepository(
      TransactionsRepository,
    );
    const categoriesRepositories = getRepository(Category);

    const input = fs.createReadStream(path);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = input.pipe(parsers);

    const categories: Array<string> = [];
    const transactions: Array<CSVTransaction> = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const existCategories = await categoriesRepositories.find({
      where: {
        title: In(categories),
      },
    });

    const titlesCategories = existCategories.map(
      (catergory: Category) => catergory.title,
    );

    const addCategoriTitles = categories
      .filter(category => !titlesCategories.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepositories.create(
      addCategoriTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepositories.save(newCategories);

    const finalCategories = [...newCategories, ...existCategories];

    const createdTransaction = transactionsRepositories.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepositories.save(createdTransaction);

    await fs.promises.unlink(path);

    return createdTransaction;
  }
}

export default ImportTransactionsService;
