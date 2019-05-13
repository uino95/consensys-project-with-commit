
module.exports = {
    concatDeepUri:function(uri){
      return 'exp://172.20.10.6:19000/?req='.concat(uri)
    },
    messageLogger:function(message, title){
      const wrapTitle = title ? ` \n ${title} \n ${'-'.repeat(60)}` : ''
      const wrapMessage = `\n ${'-'.repeat(60)} ${wrapTitle} \n`
      console.log(wrapMessage)
      console.log(message)
    }
}
