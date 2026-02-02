module.exports.randomPastDate = (months = 3) => {
  const now = new Date();
  const past = new Date();
  past.setMonth(now.getMonth() - months);
  return new Date(
    past.getTime() + Math.random() * (now.getTime() - past.getTime()),
  );
};
