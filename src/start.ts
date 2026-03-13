import app from './server';

const PORT = 18999;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
