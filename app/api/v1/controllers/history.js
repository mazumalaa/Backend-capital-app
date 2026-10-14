const { getOneHistory , getDetailHistory, getAllHistory, deleteHistory } = require("../../../services/history");

async function histories(req,res,next) {
     try{
          const response = await getAllHistory(req);
          res.status(200).json({
               code:'200',
               status:'OKE',
               data:response.history,
                page:{
                    total_page:Math.ceil(response.total / response.limit),
                    total_items:response.total,
                    page:response.page,
                    limit:response.limit
               }
          })
     }catch(err){
          next(err);
     }
}

async function historyOne(req,res,next) {
     try{
          const response = await getOneHistory(req);
          res.status(200).json({
               code:'200',
               status:'OKE',
               data:response.history,
                page:{
                    total_page:Math.ceil(response.total / response.limit),
                    total_items:response.total,
                    page:response.page,
                    limit:response.limit
               }
          })
     }catch(err){
          next(err);
     }
}

async function getDetail(req,res,next) {
     try{
          const response = await getDetailHistory(req);
          res.status(200).json({
               code:'200',
               status:'OK',
               data:response,
          })
     }catch(err){
          next(err);
     }
}

async function deleteHistoryController(req,res,next) {
     try{
          const response = await deleteHistory(req);
          res.status(200).json({
               code:'200',
               status:'OK',
               data:response,
          })
     }catch(err){
          next(err);
     }
}

module.exports = {histories, historyOne , getDetail, deleteHistoryController};