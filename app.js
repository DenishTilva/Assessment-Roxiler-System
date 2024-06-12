const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'))

app.set('view engine', 'ejs');

const PORT = 5000;


const transactionSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  dateOfSale: Date,
  sold: Boolean
});


const Transaction = mongoose.model('Transaction', transactionSchema);


mongoose.connect('mongodb://localhost:27017/marketing', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));


const initializeDatabase = async () => {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const data = response.data;

    await Transaction.insertMany(data);

    console.log('Data inserted into MongoDB');
  } catch (error) {
    console.error('Error fetching data from third-party API:', error);
  }
};


app.get('/', async (req, res) => {
    const { month, page = 1, perPage = 10, search } = req.query;
    const currentPage = parseInt(page) || 1;
    const perPageCount = parseInt(perPage) || 10;
    const monthInt = parseInt(month);
  
    try {
      let matchStage = {};
      let matchStatisticsStage = {};
  
      if (monthInt) {
        matchStage = {
          $expr: { $eq: [{ $month: '$dateOfSale' }, monthInt] }
        };
        matchStatisticsStage = {
          $expr: { $eq: [{ $month: '$dateOfSale' }, monthInt] }
        };
      }
  
      if (search) {
        matchStage.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
  
      const totalCount = await Transaction.countDocuments(matchStage);
      const totalPages = Math.ceil(totalCount / perPageCount);
  
      const transactions = await Transaction.aggregate([
        { $match: matchStage },
        { $skip: (currentPage - 1) * perPageCount },
        { $limit: perPageCount }
      ]);
  
      const statistics = await Transaction.aggregate([
        { $match: matchStatisticsStage },
        {
          $group: {
            _id: null,
            totalSaleAmount: { $sum: '$price' },
            totalSoldItems: { $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] } },
            totalNotSoldItems: { $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] } }
          }
        }
      ]);
  
      const stats = statistics.length ? statistics[0] : { totalSaleAmount: 0, totalSoldItems: 0, totalNotSoldItems: 0 };
  
      res.render('home', {
        transactions,
        currentPage,
        totalPages,
        search,
        month: monthInt,
        perPage: perPageCount, 
        statistics: stats
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });


  app.get('/transactions', async (req, res) => {
    const { month, page = 1, perPage = 10, search } = req.query;
    const currentPage = parseInt(page) || 1;
    const perPageCount = parseInt(perPage) || 10;

    try {
        let query = {};

        if (month) {
            query.dateOfSale = { $expr: { $eq: [{ $month: '$dateOfSale' }, parseInt(month)] } };
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const totalCount = await Transaction.countDocuments(query);
        const totalPages = Math.ceil(totalCount / perPageCount);

        const transactions = await Transaction.find(query)
            .skip((currentPage - 1) * perPageCount)
            .limit(perPageCount);

        res.render('transactions', {
            transactions,
            currentPage,
            totalPages,
            search,
            month
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


  app.get('/statistics', async (req, res) => {
    const month = parseInt(req.query.month);

    if (!month || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Please specify a valid month (1-12)' });
    }

    try {
        const statistics = await Transaction.aggregate([
            {
                $match: {
                    $expr: { $eq: [{ $month: '$dateOfSale' }, month] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSaleAmount: { $sum: '$price' },
                    totalSoldItems: { $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] } },
                    totalNotSoldItems: { $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] } }
                }
            }
        ]);

        if (statistics.length === 0) {
            return res.status(404).json({ error: 'No data found for the specified month' });
        }

        res.render('statistics', { statistics: statistics[0], month });
    } catch (error) {
        console.error('Error fetching statistics from the database:', error);
        res.status(500).json({ error: 'Error fetching statistics from the database' });
    }
});

  app.listen(PORT,(req,res)=>{
    console.log(`Port run on ${PORT}`)
})
  